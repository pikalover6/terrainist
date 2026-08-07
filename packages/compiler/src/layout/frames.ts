/**
 * Coarse-placement frames — Loam v0.2 §4.9.1–§4.9.3.
 *
 * A frame is the horizontal footprint of a resolved envelope. Everything
 * coarse (`zone`, `at`) is expressed against one, which is how an author says
 * "up north" without ever writing a block coordinate.
 *
 * All arithmetic here is integer or IEEE-exact (`floor`, `sqrt`) precisely so
 * that two engines agree bit for bit.
 */

import { Rng, type Seed256 } from "@terrainist/stdlib";
import { ZONE_TOKENS, type ZoneToken } from "@terrainist/spec";

/** A frame: a min corner and extents, in blocks. */
export interface Frame {
  readonly x0: number;
  readonly z0: number;
  readonly width: number;
  readonly depth: number;
}

/** An inclusive rectangle of columns. */
export interface Rect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

/** A world column. */
export interface Point2 {
  readonly x: number;
  readonly z: number;
}

/**
 * The local heading of a polyline at index `i`, and its perpendicular.
 *
 * **The one heading rule in the compiler**, and it lives in this leaf module so
 * that both halves of "the street" — `carriagewayCells` in `layout/streets.ts`
 * and the street band a site planner must stand its platform under
 * (`docs/SITE-PLAN-v0.md` §3.4 rule 2) — can read the same function without a
 * module cycle. Two different notions of where a street is, is how a building
 * ends up half in the road, and how a platform ends up half under one.
 *
 * Re-exported from `layout/streets.ts`, which is where it used to live and where
 * every existing consumer still imports it from.
 */
export function headingOf(
  path: readonly Point2[],
  i: number,
): { readonly dx: number; readonly dz: number; readonly px: number; readonly pz: number } {
  const before = path[Math.max(0, i - 1)] as Point2;
  const after = path[Math.min(path.length - 1, i + 1)] as Point2;
  const dx = Math.sign(after.x - before.x);
  const dz = Math.sign(after.z - before.z);
  if (dx === 0 && dz === 0) return { dx: 0, dz: 1, px: 0, pz: 1 };
  // Perpendicular: rotate the heading a quarter turn. `pz` scales the x offset
  // and `px` the z offset, which is the convention `surfaceRoute` uses.
  return { dx, dz, px: dx, pz: -dz };
}

/** The nine-grid cell indices of each token (§4.9.2). North is −Z, east is +X. */
export const ZONE_CELL: Readonly<Record<ZoneToken, readonly [number, number]>> = Object.freeze({
  northwest: [0, 0],
  north: [1, 0],
  northeast: [2, 0],
  west: [0, 1],
  center: [1, 1],
  east: [2, 1],
  southwest: [0, 2],
  south: [1, 2],
  southeast: [2, 2],
});

/** True when `token` is one of the nine. */
export function isZoneToken(token: string): token is ZoneToken {
  return (ZONE_TOKENS as readonly string[]).includes(token);
}

/**
 * `frameNorm` — the frame's half-diagonal (§4.9.1), used to normalize every
 * coarse cost so a cost of 1 means "a frame away" regardless of region size.
 */
export function frameNorm(frame: Frame): number {
  return 0.5 * Math.sqrt(frame.width * frame.width + frame.depth * frame.depth);
}

/** Map a fractional `[fx, fz] ∈ [0,1]²` to a world column (§4.9.1). */
export function fractionalPoint(frame: Frame, fx: number, fz: number): Point2 {
  return { x: frame.x0 + Math.floor(fx * frame.width), z: frame.z0 + Math.floor(fz * frame.depth) };
}

/**
 * The inclusive cell rectangle of a zone token (§4.9.2).
 *
 * Cell *i* spans `[x0 + floor(i·W/3), x0 + floor((i+1)·W/3) − 1]`, so the nine
 * cells tile the frame exactly — no gaps, no overlap.
 */
export function zoneRect(frame: Frame, token: ZoneToken): Rect {
  const [i, j] = ZONE_CELL[token];
  const x0 = frame.x0 + Math.floor((i * frame.width) / 3);
  const x1 = frame.x0 + Math.floor(((i + 1) * frame.width) / 3) - 1;
  const z0 = frame.z0 + Math.floor((j * frame.depth) / 3);
  const z1 = frame.z0 + Math.floor(((j + 1) * frame.depth) / 3) - 1;
  return { x0, z0, x1, z1 };
}

/** The integer centre of a rectangle. */
export function rectCenter(rect: Rect): Point2 {
  return { x: Math.floor((rect.x0 + rect.x1) / 2), z: Math.floor((rect.z0 + rect.z1) / 2) };
}

/** Horizontal distance from a point to the nearest point of a rectangle; 0 inside. */
export function distanceToRect(rect: Rect, x: number, z: number): number {
  const dx = x < rect.x0 ? rect.x0 - x : x > rect.x1 ? x - rect.x1 : 0;
  const dz = z < rect.z0 ? rect.z0 - z : z > rect.z1 ? z - rect.z1 : 0;
  if (dx === 0 && dz === 0) return 0;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * The jittered target point of a `zone` constraint (§4.9.3).
 *
 * `u₀`/`u₁` are the *2k*-th and *(2k+1)*-th draws of the node's `coarse`
 * stream, where *k* is the constraint's index in the node's `constraints`
 * array. Indexing by position rather than draw order is deliberate: adding an
 * unrelated constraint must never move an already-placed feature.
 */
export function jitteredZonePoint(
  frame: Frame,
  token: ZoneToken,
  jitter: number,
  coarseSeed: Seed256,
  constraintIndex: number,
): Point2 {
  const rect = zoneRect(frame, token);
  const centre = rectCenter(rect);
  const rng = new Rng(coarseSeed);
  let u0 = 0;
  let u1 = 0;
  for (let k = 0; k <= constraintIndex; k++) {
    u0 = rng.float();
    u1 = rng.float();
  }
  const jx = (2 * u0 - 1) * jitter * frame.width;
  const jz = (2 * u1 - 1) * jitter * frame.depth;
  return {
    x: clampInt(centre.x + Math.floor(jx), frame.x0, frame.x0 + frame.width - 1),
    z: clampInt(centre.z + Math.floor(jz), frame.z0, frame.z0 + frame.depth - 1),
  };
}

/** Clamp an integer into an inclusive range. */
export function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** The whole frame as a rectangle. */
export function frameRect(frame: Frame): Rect {
  return { x0: frame.x0, z0: frame.z0, x1: frame.x0 + frame.width - 1, z1: frame.z0 + frame.depth - 1 };
}

/** Intersect two rectangles; returns `null` when they do not meet. */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x0, b.x0);
  const x1 = Math.min(a.x1, b.x1);
  const z0 = Math.max(a.z0, b.z0);
  const z1 = Math.min(a.z1, b.z1);
  if (x0 > x1 || z0 > z1) return null;
  return { x0, z0, x1, z1 };
}
