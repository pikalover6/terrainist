/**
 * ============================================================================
 * IMPORT SEAM — the SweptProfile engine
 * ============================================================================
 *
 * pins one engine (`packages/compiler/src/structures/sweep.ts`) with four
 * clients, of which `infra.wall@0` is the second. That engine is being built in
 * parallel with this pass. **This file is the only place the wall pass touches
 * it**, and it exists so the swap is a one-file change:
 *
 *   - {@link SweptProfile} and friends below are the **pinned contract types,
 *     restated verbatim** from the design doc. When `sweep.ts` lands, delete
 *     them and re-export the real ones. They must not drift; if they have, the
 *     design doc wins.
 *   - {@link sweepCourse} is a **local fixture implementation** covering
 *     exactly the subset a wall needs: `follow: "step"` with a 1-Lipschitz
 *     upper envelope for the datum, mirrored bands measured perpendicular to
 *     the true centre line, and interval features by arc length. When
 *     `sweep.ts` lands this function becomes an adapter over `sweep()` — it
 *     already speaks in the contract's vocabulary, so nothing above it moves.
 *
 * The one deliberate difference from the pinned `sweep()` signature: this
 * fixture returns **swept columns**, not blocks. The wall pass writes its
 * blocks through `structures/life.ts`'s `Planter`, which is what makes the
 * result physics-lint-clean and all-or-nothing per column (contract rule 7);
 * an engine that emitted `StructureBlock[]` directly would have to duplicate
 * that occupancy view. `SweptColumn` is a strictly finer answer than the
 * contract's `claimed` mask, so the adapter direction is the easy one.
 *
 * Nothing here is seeded and nothing here draws: the geometry is a pure
 * function of the path and the ground.
 */

/* -------------------------------------------------------------------------- */
/* pinned contract types — single source of truth is `sweep.ts`                */
/* -------------------------------------------------------------------------- */

// The engine landed (structures/sweep.ts); its declarations ARE the pinned
// contract, so this module re-exports them instead of restating them. The
// ring-specific machinery below (closed-course datum, seam convergence,
// windowed true-line normals) is the wall's own and is not in the engine yet;
// unifying closed-ring sweeps into `sweep()` is a recorded follow-up.
export type {
  BandRole,
  ProfileBand,
  BandCap,
  IntervalFeature,
  SweptProfile,
} from "./sweep.js";
import type { SweptProfile, ProfileBand, BandCap, BandRole } from "./sweep.js";

/* -------------------------------------------------------------------------- */
/* the fixture's own vocabulary                                               */
/* -------------------------------------------------------------------------- */

/** A world column. */
export interface SweepPoint {
  readonly x: number;
  readonly z: number;
}

/** One column the sweep claimed, and what belongs in it. */
export interface SweptColumn {
  readonly x: number;
  readonly z: number;
  /** Index into the input path this column was thrown off. */
  readonly pathIndex: number;
  /** Signed lateral offset from the centre line, in columns. */
  readonly offset: number;
  readonly bandId: string;
  readonly role: BandRole;
  /** World Y of this column's top course — the band's surface. */
  readonly top: number;
  readonly surface: string;
  readonly fill: string;
  readonly cap?: BandCap;
}

/** An interval feature the sweep seated. */
interface SweptFeature {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly pathIndex: number;
  /** True when this instance was seated on a bend rather than at pitch. */
  readonly onBend: boolean;
}

/** Everything {@link sweepCourse} reads. */
export interface SweepCourseInput {
  readonly profile: SweptProfile;
  /** 4-connected world columns; closed when {@link closed}. */
  readonly path: readonly SweepPoint[];
  /** The ring case: the last column is adjacent to the first. */
  readonly closed?: boolean;
  /** Stand height of a column, or `undefined` where nothing may be built. */
  readonly ground: (x: number, z: number) => number | undefined;
  /** Path indices to leave open — gates, crossings the caller handled. */
  readonly skip?: (pathIndex: number) => boolean;
  /** Path indices that are corners of the true line, for `at: "bend"`. */
  readonly bends?: readonly number[];
  /**
   * How far, along the bands' hand, the ground this course retains begins
   * (a ring's margin). Only a profile with a `datumOffset` reads it: the
   * datum reaches out to it, and the last band widens so the walk meets it.
   */
  readonly reach?: number;
  /** Blocks of the datum's height above the ground the profile aims for. */
  readonly rise: number;
}

/** What {@link sweepCourse} produced. */
export interface SweepCourseResult {
  readonly columns: readonly SweptColumn[];
  /** The datum actually built to, per path index. */
  readonly datum: Int32Array;
  readonly features: readonly SweptFeature[];
  /** Path indices refused because the ground under them was unbuildable. */
  readonly refused: readonly number[];
}

/* -------------------------------------------------------------------------- */
/* the fixture                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The datum, as a 1-Lipschitz **upper** envelope of the target.
 *
 * Contract rule 1: `"step"` changes the datum by at most `maxGrade` per column
 * and holds it otherwise. Rule 2's tread construction is the same shape taken
 * backwards, and the reason to take the *upper* envelope rather than a forward
 * clamp is that it is the only one that keeps the guarantee the caller actually
 * needs — the crest is never less than `rise` above the ground — while still
 * stepping by at most `maxGrade`. A forward clamp would let the wall sink into
 * a rise it could not climb fast enough, which is the defect the old
 * `curtain_wall` prop had in its most visible form.
 *
 * `d[k] = max_j (target[j] − maxGrade · dist(k, j))`, computed in two sweeps
 * per direction so the ring's seam converges rather than being a discontinuity.
 */
/**
 * A builder's crown: level runs, stepping where it must.
 *
 * Walk the course from the highest preferred index (a tower, a corner — so a
 * closed ring's seam, when the ground forces one, is a step at a tower, and a
 * ring the stand limit can bridge has none). Each run's level is the highest target
 * over the longest window of up to `runLength` points whose range fits the
 * slack (`maxStand − rise`, the most the walk may stand above the ground on
 * ordinary ground); the run then extends while that level neither buries the
 * walk (target above it) nor stands it more than the slack proud — **or, past
 * the slack, while the ground is a dip**: back in the band within `holdSpan`
 * stations with the wall never more than `holdStand` proud across it, in
 * which case the line is held over the whole dip (the Wall Run, W1). Where a
 * step is coming, a preferred index just behind it takes the step instead.
 * Steep ground gets short runs and many steps — a stair of walls, never a
 * ramp; a dip gets one level line across it, up to `holdStand` tall; a peak
 * gets a run at its own height and steps on both sides, because its far side
 * never comes back to its band.
 */
/** The shortest tread a `run` datum lays even where the ground falls faster than its slack allows. */
export const RUN_LEAST = 3;

export function runDatum(
  target: readonly number[],
  rise: number,
  runLength: number,
  maxStand: number,
  preferred: ReadonlySet<number>,
  closed: boolean,
  cover = 0,
  holdStand = maxStand,
  holdSpan = 0,
): Int32Array {
  const n = target.length;
  const d = new Int32Array(n);
  if (n === 0) return d;
  const slack = Math.max(0, maxStand - rise);
  // Across a dip the line is held: the run keeps its level over ground that
  // leaves the ordinary band, provided the ground comes back to the band
  // within `holdSpan` stations and the wall never stands more than
  // `holdStand` proud on the way. Ground that leaves the band and does not
  // come back — a knoll's far side, a lower plateau — is not a dip: the run
  // ends and the crown steps, as it always did.
  const holdSlack = Math.max(slack, holdStand - rise);
  const span = Math.max(0, Math.round(holdSpan));
  const run = Math.max(1, Math.round(runLength));
  const hide = Math.max(0, Math.round(cover));
  // A run shorter than this is not a segment: on ground steeper than the
  // slack allows, the tread keeps this length and the riser grows instead.
  const least = Math.min(run, RUN_LEAST);
  const at = (k: number): number => (closed ? ((k % n) + n) % n : Math.min(Math.max(k, 0), n - 1));
  const t = (k: number): number => target[at(k)] as number;
  // A closed ring is walked from its *highest* preferred index — the tower on
  // the crown of the hill. Every departure from there is a descent the run
  // can hold across up to `holdStand`, so a ring the hold can bridge has no seam:
  // the last run comes back to the level it left. Walked from the first
  // index instead, a ring seamed at a step wherever index 0 happened to lie
  // on the slope (the Wall Run's unit 2, `records/w2-mechanism.md`). Ties go
  // to the lowest index, so a level ring still seams where it always did.
  let start = 0;
  if (closed && preferred.size > 0) {
    let best = -Infinity;
    for (const p of [...preferred].sort((a, b) => a - b)) {
      const v = t(p);
      if (v > best) {
        best = v;
        start = p;
      }
    }
  }
  let i = start;
  let done = 0;
  while (done < n) {
    // A run that starts at a preferred index (a tower) is not constrained by
    // the columns the tower's body covers: the step can hide inside it.
    const covered = preferred.has(at(i)) ? Math.min(hide, Math.max(0, n - done - 1)) : 0;
    let hi = t(i + covered);
    let lo = hi;
    let m = covered + 1;
    while (m < run + covered && done + m < n) {
      const v = t(i + m);
      const nh = Math.max(hi, v);
      const nl = Math.min(lo, v);
      if (nh - nl > slack && m >= least + covered) break;
      hi = nh;
      lo = nl;
      m++;
    }
    const level = hi;
    let len = m;
    while (done + len < n) {
      const v = t(i + len);
      if (v > level) break;
      if (level - v > slack) {
        // Out of the band. A dip, if the ground is back in the band within the
        // span without the wall standing past the hold limit: the run takes the
        // whole dip and the loop re-examines the far bank (a higher bank ends
        // the run there, a level one carries on). Otherwise the run ends here.
        let back = -1;
        for (let k = len; k < len + span && done + k < n; k++) {
          const u = t(i + k);
          if (level - u > holdSlack) break;
          if (level - u <= slack) {
            back = k;
            break;
          }
        }
        if (back < 0) break;
        len = back;
        continue;
      }
      len++;
    }
    if (done + len < n) {
      for (let p = i + len - 1; p > i && p >= i + len - Math.ceil(run / 2); p--) {
        if (preferred.has(at(p))) {
          len = p - i;
          break;
        }
      }
    }
    for (let k = 0; k < len; k++) d[at(i + k)] = level;
    i += len;
    done += len;
  }
  return d;
}

export function stepDatum(
  target: readonly number[],
  maxGrade: number,
  closed: boolean,
): Int32Array {
  const n = target.length;
  const d = Int32Array.from(target);
  const passes = closed ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    for (let k = 1; k < n + (closed ? 1 : 0); k++) {
      const i = k % n;
      const p = (k - 1) % n;
      const floorAt = (d[p] as number) - maxGrade;
      if ((d[i] as number) < floorAt) d[i] = floorAt;
    }
    for (let k = n - 2; k >= (closed ? -1 : 0); k--) {
      const i = ((k % n) + n) % n;
      const p = (i + 1) % n;
      const floorAt = (d[p] as number) - maxGrade;
      if ((d[i] as number) < floorAt) d[i] = floorAt;
    }
  }
  return d;
}

/**
 * The unit normal at a path index, from the **true** line rather than the
 * rasterized cells (contract rule 3).
 *
 * A central difference over a window wider than one column: a 4-connected
 * rasterization of a 15° edge alternates between a long run of straight steps
 * and a single jog, so the one-column difference is either `(1,0)` or `(0,1)`
 * and never the direction the edge actually runs at. The window is what
 * recovers the true bearing.
 */
export function normalAt(
  path: readonly SweepPoint[],
  i: number,
  closed: boolean,
  window = 4,
): { nx: number; nz: number } {
  const n = path.length;
  const at = (k: number): SweepPoint =>
    closed ? (path[((k % n) + n) % n] as SweepPoint) : (path[Math.max(0, Math.min(n - 1, k))] as SweepPoint);
  const a = at(i - window);
  const b = at(i + window);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len === 0) return { nx: 0, nz: 1 };
  // Left normal of the tangent.
  return { nx: -dz / len, nz: dx / len };
}

/** Sweep the profile along the course. */
export function sweepCourse(input: SweepCourseInput): SweepCourseResult {
  const { path, rise } = input;
  let profile = input.profile;
  if (profile.datumOffset !== undefined && input.reach !== undefined) {
    const width = profile.bands.reduce((sum, b) => sum + b.width, 0);
    const last = profile.bands[profile.bands.length - 1];
    if (input.reach > width && last !== undefined && last.centred !== true) {
      profile = {
        ...profile,
        datumOffset: Math.max(profile.datumOffset, input.reach),
        bands: [...profile.bands.slice(0, -1), { ...last, width: last.width + (input.reach - width) }],
      };
    } else if (input.reach > profile.datumOffset) {
      profile = { ...profile, datumOffset: input.reach };
    }
  }
  const n = path.length;
  const closed = input.closed ?? false;
  const skip = input.skip ?? ((): boolean => false);

  // --- the datum ------------------------------------------------------------
  const refused: number[] = [];
  const target: number[] = [];
  let lastGood = 0;
  let anyGood = false;
  const datumOffset = profile.datumOffset ?? 0;
  for (let i = 0; i < n; i++) {
    const c = path[i] as SweepPoint;
    let g = input.ground(c.x, c.z);
    if (datumOffset !== 0) {
      // The ground the profile retains: the highest ground within reach on
      // the bands' hand — the whole half-square, not one ray, so a terrace's
      // corner is read from the chamfer that rounds it and the walk does not
      // dip around every corner it turns.
      const { nx, nz } = normalAt(path, i, closed);
      const r = Math.abs(datumOffset);
      const hand = Math.sign(datumOffset);
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if ((dx * nx + dz * nz) * hand <= 0) continue;
          const go = input.ground(c.x + dx, c.z + dz);
          if (go !== undefined && (g === undefined || go > g)) g = go;
        }
      }
    }
    if (g === undefined) {
      refused.push(i);
      target.push(anyGood ? lastGood : 0);
      continue;
    }
    lastGood = g + rise;
    anyGood = true;
    target.push(lastGood);
  }
  if (!anyGood) {
    return { columns: [], datum: new Int32Array(n), features: [], refused };
  }
  // A refused column before the first good one inherited a zero; back-fill it
  // so the envelope is not dragged to the floor of the world.
  for (let i = 0; i < n; i++) if (target[i] === 0 && refused.includes(i)) target[i] = lastGood;

  // Where the profile's features sit — decided before the datum, because a
  // `run` datum prefers to step where a tower or a corner stands.
  const bends = new Set(input.bends ?? []);
  const seats: { id: string; index: number; onBend: boolean; offset: number }[] = [];
  for (const feature of profile.features ?? []) {
    const mode = feature.at ?? "interval";
    const seen = new Set<number>();
    const seat = (i: number, onBend: boolean): void => {
      if (skip(i) || seen.has(i)) return;
      seen.add(i);
      seats.push({ id: feature.id, index: i, onBend, offset: feature.offset });
    };
    if (mode === "bend" || mode === "both") {
      for (const b of [...bends].sort((a, z) => a - z)) if (b >= 0 && b < n) seat(b, true);
    }
    if (mode === "interval" || mode === "both") {
      const pitch = Math.max(2, Math.round(feature.pitch));
      for (let i = feature.phase ?? 0; i < n; i += pitch) {
        let near = false;
        for (const f of seats) {
          if (f.id === feature.id && Math.abs(f.index - i) < pitch / 2) near = true;
        }
        if (!near) seat(i, false);
      }
    }
  }

  const datum =
    profile.follow === "level"
      ? Int32Array.from(target, () => Math.max(...target))
      : profile.follow === "run"
        ? runDatum(
            target,
            rise,
            profile.runLength ?? 8,
            profile.maxStand ?? 12,
            new Set([...seats.map((f) => f.index), ...bends]),
            closed,
            profile.runCover ?? 0,
            profile.holdStand ?? profile.maxStand ?? 12,
            profile.holdSpan ?? 0,
          )
        : stepDatum(target, Math.max(1, profile.maxGrade), closed);

  /** `[band, from, to]` per side, offsets measured outward from the line. */
  const lanes: { band: ProfileBand; lo: number; hi: number }[] = [];
  let edge = 0;
  for (const band of profile.bands) {
    if (band.centred === true) {
      const half = (band.width - 1) / 2;
      lanes.push({ band, lo: -Math.floor(half), hi: Math.floor(half) });
      edge = Math.floor(half) + 1;
    } else {
      lanes.push({ band, lo: edge, hi: edge + band.width - 1 });
      if (profile.asymmetric !== true) {
        lanes.push({ band, lo: -(edge + band.width - 1), hi: -edge });
      }
      edge += band.width;
    }
  }

  // --- the columns ----------------------------------------------------------
  // Innermost band wins a contested column (contract rule 4), so the result is
  // idempotent per column by construction: one entry per column, decided by the
  // best claim seen, rather than a list that a second pass has to reconcile.
  // Rank is the *lane* index, not the band index — a mirrored band contributes
  // two lanes at the same distance, and both must rank equally against an
  // inner band.
  const best = new Map<string, { rank: number; column: SweptColumn }>();
  for (let i = 0; i < n; i++) {
    if (skip(i)) continue;
    const c = path[i] as SweepPoint;
    const { nx, nz } = normalAt(path, i, closed);
    const d = datum[i] as number;
    for (const lane of lanes) {
      const rank = Math.min(Math.abs(lane.lo), Math.abs(lane.hi));
      for (let o = lane.lo; o <= lane.hi; o++) {
        const x = Math.round(c.x + nx * o);
        const z = Math.round(c.z + nz * o);
        const key = `${x},${z}`;
        const held = best.get(key);
        if (held !== undefined && held.rank <= rank) continue;
        const band = lane.band;
        best.set(key, {
          rank,
          column: {
            x,
            z,
            pathIndex: i,
            offset: o,
            bandId: band.id,
            role: band.role,
            top: d + (band.level ?? 0),
            surface: band.surface,
            fill: band.fill ?? band.surface,
            ...(band.cap === undefined ? {} : { cap: band.cap }),
          },
        });
      }
    }
  }

  // --- interval features ----------------------------------------------------
  const features: SweptFeature[] = seats.map((f) => {
    const c = path[f.index] as SweepPoint;
    const { nx, nz } = normalAt(path, f.index, closed);
    return {
      id: f.id,
      x: Math.round(c.x + nx * f.offset),
      z: Math.round(c.z + nz * f.offset),
      y: datum[f.index] as number,
      pathIndex: f.index,
      onBend: f.onBend,
    };
  });
  return { columns: [...best.values()].map((e) => e.column), datum, features, refused };
}
