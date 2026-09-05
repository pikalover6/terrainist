/**
 * Shared position-keyed detail hashing for the materials and decoration passes.
 *
 * G2.5b decorates every land column — grass, flowers, rock patches, ash bands —
 * which is one to five draws per column over a quarter-million columns. Running
 * each of those through BLAKE3 (`positionFloat`) would dominate the compile, so
 * the detail passes use an **integer avalanche hash** seeded from a proper
 * §6 stream seed instead.
 *
 * That keeps the determinism contract intact: the hash is a pure function of
 * `(streamSeed, x, y, z, salt)` built from `Math.imul` and 32-bit shifts, all of
 * which are exactly specified by IEEE-754/ECMA — no floating-point
 * transcendentals, no traversal order dependence, no wall clock. Two compiles of
 * the same document on different machines see the same numbers.
 */

import { seed32, streamSeed, type Seed256 } from "@terrainist/stdlib";

/** A named detail stream: a 32-bit seed derived from a node seed. */
export function detailSeed(node: Seed256, name: string): number {
  return seed32(streamSeed(node, name));
}

/** 32-bit avalanche mix (the finalizer of MurmurHash3). */
function mix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash a 3-D position plus a salt into a 32-bit value. */
export function hash3i(seed: number, x: number, y: number, z: number, salt = 0): number {
  let h = seed >>> 0;
  h = mix32(h ^ Math.imul(x | 0, 0x27d4eb2d));
  h = mix32(h ^ Math.imul(y | 0, 0x165667b1));
  h = mix32(h ^ Math.imul(z | 0, 0x9e3779b1));
  return mix32(h ^ Math.imul(salt | 0, 0x85ebca77));
}

/** A uniform `[0, 1)` draw keyed on a 3-D position. */
export function hash3(seed: number, x: number, y: number, z: number, salt = 0): number {
  return hash3i(seed, x, y, z, salt) / 4294967296;
}

/** A uniform `[0, 1)` draw keyed on a column. */
export function hash2(seed: number, x: number, z: number, salt = 0): number {
  return hash3(seed, x, 0, z, salt);
}

/** A uniform integer in `[lo, hi]` keyed on a column. */
export function hashInt(seed: number, x: number, z: number, salt: number, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + (hash3i(seed, x, 0, z, salt) % (hi - lo + 1));
}

/** Pick one of `choices` uniformly, keyed on a column. */
export function hashPick<T>(seed: number, x: number, z: number, salt: number, choices: readonly T[]): T {
  return choices[hash3i(seed, x, 0, z, salt) % choices.length] as T;
}
