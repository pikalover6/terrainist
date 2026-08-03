/**
 * ============================================================================
 * IMPORT SEAM — the SweptProfile engine
 * ============================================================================
 *
 * `docs/DESIGN.md` → "Upgrade push — Phase 0 contracts" → "3. SweptProfile"
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
export interface SweptFeature {
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
  const { profile, path, rise } = input;
  const n = path.length;
  const closed = input.closed ?? false;
  const skip = input.skip ?? ((): boolean => false);

  // --- the datum ------------------------------------------------------------
  const refused: number[] = [];
  const target: number[] = [];
  let lastGood = 0;
  let anyGood = false;
  for (let i = 0; i < n; i++) {
    const c = path[i] as SweepPoint;
    const g = input.ground(c.x, c.z);
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

  const datum =
    profile.follow === "level"
      ? Int32Array.from(target, () => Math.max(...target))
      : stepDatum(target, Math.max(1, profile.maxGrade), closed);

  // --- lateral extents of each band ----------------------------------------
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
  const features: SweptFeature[] = [];
  const bends = new Set(input.bends ?? []);
  for (const feature of profile.features ?? []) {
    const mode = feature.at ?? "interval";
    const seen = new Set<number>();
    const seat = (i: number, onBend: boolean): void => {
      if (skip(i) || seen.has(i)) return;
      seen.add(i);
      const c = path[i] as SweepPoint;
      const { nx, nz } = normalAt(path, i, closed);
      features.push({
        id: feature.id,
        x: Math.round(c.x + nx * feature.offset),
        z: Math.round(c.z + nz * feature.offset),
        y: datum[i] as number,
        pathIndex: i,
        onBend,
      });
    };
    if (mode === "bend" || mode === "both") {
      for (const b of [...bends].sort((a, z) => a - z)) if (b >= 0 && b < n) seat(b, true);
    }
    if (mode === "interval" || mode === "both") {
      const pitch = Math.max(2, Math.round(feature.pitch));
      // Phase-locked to the path start, so recompiling gives the same towers.
      for (let i = feature.phase ?? 0; i < n; i += pitch) {
        // Never within half a pitch of a bend instance already seated: two
        // towers overlapping read as one lumpy tower.
        let near = false;
        for (const f of features) {
          if (f.id === feature.id && Math.abs(f.pathIndex - i) < pitch / 2) near = true;
        }
        if (!near) seat(i, false);
      }
    }
  }

  return { columns: [...best.values()].map((e) => e.column), datum, features, refused };
}
