/**
 * Determinism primitives — seed derivation, named RNG streams, position-keyed
 * hashing. Implements LOAM-SPEC-v0.1 §6 exactly.
 *
 * Nothing here reads the clock, the filesystem, or any ambient state. Every
 * function is pure: the same inputs always yield the same bytes.
 */

import { blake3 } from "@noble/hashes/blake3.js";

import {
  TWO_POW_NEG53,
  cos as mathCos,
  log as mathLog,
  sqrt as mathSqrt,
} from "../math/index.js";

const MASK64 = 0xffffffffffffffffn;
const TWO_POW_64 = 0x10000000000000000n;

const utf8 = new TextEncoder();

/** A 256-bit seed (32 bytes), used directly as PRNG state material. */
export type Seed256 = Uint8Array;

// ---------------------------------------------------------------------------
// §6.1 — the world seed
// ---------------------------------------------------------------------------

/**
 * Resolve `meta.worldSeed` to the canonical 64-bit unsigned value (§6.1):
 *
 * - a hex string `"0x…"` → parsed as u64;
 * - a decimal string or an integer-valued JSON number → u64 (two's complement
 *   for negatives, so `-1` becomes `2^64 - 1`);
 * - any other UTF-8 string → `truncate64(BLAKE3(utf8(s)))`, where `truncate64`
 *   reads the first 8 output bytes little-endian.
 *
 * Numbers outside ±2^53 must be written as strings; passing one throws (the
 * compiler surfaces this as `LOAM-E190`).
 */
export function resolveWorldSeed(input: string | number | bigint): bigint {
  if (typeof input === "bigint") return BigInt.asUintN(64, input);
  if (typeof input === "number") {
    if (!Number.isInteger(input)) {
      throw new RangeError(`worldSeed number must be an integer, got ${input}`);
    }
    if (!Number.isSafeInteger(input)) {
      throw new RangeError(
        `worldSeed ${input} exceeds ±2^53; write it as a decimal string (LOAM-E190)`,
      );
    }
    return BigInt.asUintN(64, BigInt(input));
  }
  const s = input.trim();
  if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(s)) {
    const neg = s.startsWith("-");
    const mag = BigInt(s.replace(/^[+-]/, ""));
    return BigInt.asUintN(64, neg ? -mag : mag);
  }
  if (/^[+-]?[0-9]+$/.test(s)) {
    return BigInt.asUintN(64, BigInt(s));
  }
  return truncate64(blake3(utf8.encode(input)));
}

/** Read the first 8 bytes of a digest as a little-endian u64. */
export function truncate64(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i] as number);
  return v;
}

/** Encode a bigint as 8 little-endian bytes (`LE64`). */
export function le64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = BigInt.asUintN(64, value);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Encode a signed 32-bit integer as 4 little-endian bytes (`LE32`). */
export function le32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  const v = value | 0;
  out[0] = v & 0xff;
  out[1] = (v >>> 8) & 0xff;
  out[2] = (v >>> 16) & 0xff;
  out[3] = (v >>> 24) & 0xff;
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// §6.2 / §6.3 — node seeds, stream seeds, position-keyed values
// ---------------------------------------------------------------------------

/**
 * `nodeSeed(n) = BLAKE3_256(LE64(worldSeed) ‖ 0x00 ‖ utf8(nodePath) ‖ 0x00 ‖ utf8(seedSalt))`
 *
 * `nodePath` is the dot-joined id chain from the root; `seedSalt` defaults to
 * `""` and is the repair loop's reroll knob.
 */
export function nodeSeed(worldSeed: bigint, nodePath: string, seedSalt = ""): Seed256 {
  return blake3(
    concat([
      le64(worldSeed),
      Uint8Array.of(0x00),
      utf8.encode(nodePath),
      Uint8Array.of(0x00),
      utf8.encode(seedSalt),
    ]),
    { dkLen: 32 },
  );
}

/** `streamSeed(n, name) = BLAKE3_256(nodeSeed ‖ 0x01 ‖ utf8(name))`. */
export function streamSeed(node: Seed256, name: string): Seed256 {
  return blake3(concat([node, Uint8Array.of(0x01), utf8.encode(name)]), { dkLen: 32 });
}

/** The reserved stream names of §6.3. Generators may declare their own. */
export const RESERVED_STREAMS = Object.freeze([
  "layout",
  "repeat",
  "palette",
  "scatter",
  "grammar",
  "jitter",
  "decor",
  "carve",
  "noise",
] as const);

/** One of the reserved stream names. */
export type ReservedStream = (typeof RESERVED_STREAMS)[number];

/**
 * `value(n, name, x, y, z) = BLAKE3_256(streamSeed(n, name) ‖ LE32(x) ‖ LE32(y) ‖ LE32(z))`
 *
 * Position-keyed draws are independent of iteration order, which is what lets
 * chunked / parallel / partial evaluation agree.
 */
export function positionDigest(stream: Seed256, x: number, y: number, z: number): Seed256 {
  return blake3(concat([stream, le32(x), le32(y), le32(z)]), { dkLen: 32 });
}

/** Position-keyed uniform float in `[0, 1)` — the column/block decision workhorse. */
export function positionFloat(stream: Seed256, x: number, y: number, z: number): number {
  const d = positionDigest(stream, x, y, z);
  return Number(truncate64(d) >> 11n) * TWO_POW_NEG53;
}

/** Position-keyed uniform integer in `[lo, hi]` (inclusive both ends). */
export function positionInt(
  stream: Seed256,
  x: number,
  y: number,
  z: number,
  lo: number,
  hi: number,
): number {
  if (hi < lo) throw new RangeError(`positionInt: empty range [${lo}, ${hi}]`);
  const span = BigInt(hi - lo + 1);
  const digest = positionDigest(stream, x, y, z);
  // Lemire multiply-shift, no rejection loop: a position-keyed draw cannot
  // "draw again" without becoming order-dependent, so we take the (negligible,
  // < 2^-64 relative) bias and document it here.
  return lo + Number((truncate64(digest) * span) >> 64n);
}

/**
 * Position-keyed weighted pick over entries in **declaration order** (§6.4's
 * `weighted` rule), used for palette `mix` resolution per column.
 * Returns the chosen index.
 */
export function positionWeighted(
  stream: Seed256,
  x: number,
  y: number,
  z: number,
  weights: readonly number[],
): number {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  const threshold = positionFloat(stream, x, y, z) * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] as number;
    if (threshold < acc) return i;
  }
  return weights.length - 1;
}

/** A convenience column-keyed float (y is pinned to 0). */
export function columnFloat(stream: Seed256, x: number, z: number, salt = 0): number {
  return positionFloat(stream, x, salt, z);
}

// ---------------------------------------------------------------------------
// §6.4 — the PRNG (xoshiro256**)
// ---------------------------------------------------------------------------

/** The golden-ratio constant used to repair an all-zero xoshiro state. */
const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n;

function rotl(x: bigint, k: bigint): bigint {
  return ((x << k) | (x >> (64n - k))) & MASK64;
}

/**
 * xoshiro256\*\*, seeded from the first 256 bits of a stream seed.
 *
 * All derived values follow the §6.4 table exactly:
 * `float()` is `(nextU64() >>> 11) · 2^-53`; `int()` is Lemire rejection
 * sampling; `weighted()` walks cumulative weights in declaration order;
 * `gaussian()` is Box–Muller and **discards** its second value.
 */
export class Rng {
  private s0: bigint;
  private s1: bigint;
  private s2: bigint;
  private s3: bigint;

  constructor(seed: Seed256) {
    if (seed.length < 32) throw new RangeError("Rng requires a 256-bit seed");
    const words: bigint[] = [];
    for (let i = 0; i < 4; i++) {
      words.push(truncate64(seed.subarray(i * 8, i * 8 + 8)));
    }
    let allZero = true;
    for (const w of words) {
      if (w !== 0n) allZero = false;
    }
    if (allZero) {
      for (let i = 0; i < 4; i++) words[i] = GOLDEN_GAMMA;
    }
    this.s0 = words[0] as bigint;
    this.s1 = words[1] as bigint;
    this.s2 = words[2] as bigint;
    this.s3 = words[3] as bigint;
  }

  /** Build an RNG for `(node, streamName)` in one step. */
  static forStream(node: Seed256, name: string): Rng {
    return new Rng(streamSeed(node, name));
  }

  /** One xoshiro256** step. */
  nextU64(): bigint {
    const result = (rotl((this.s1 * 5n) & MASK64, 7n) * 9n) & MASK64;
    const t = (this.s1 << 17n) & MASK64;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 45n);
    return result;
  }

  /** Uniform double in `[0, 1)`. */
  float(): number {
    return Number(this.nextU64() >> 11n) * TWO_POW_NEG53;
  }

  /** Uniform integer in `[lo, hi]`, inclusive both ends (Lemire rejection). */
  int(lo: number, hi: number): number {
    if (hi < lo) throw new RangeError(`Rng.int: empty range [${lo}, ${hi}]`);
    const range = BigInt(hi - lo + 1);
    let x = this.nextU64();
    let m = x * range;
    let l = m & MASK64;
    if (l < range) {
      const t = (TWO_POW_64 - range) % range;
      while (l < t) {
        x = this.nextU64();
        m = x * range;
        l = m & MASK64;
      }
    }
    return lo + Number(m >> 64n);
  }

  /** Uniform element of `array`. */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) throw new RangeError("Rng.pick: empty array");
    return array[this.int(0, array.length - 1)] as T;
  }

  /** Weighted index over cumulative weights in **declaration order**. */
  weighted(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return 0;
    const threshold = this.float() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i] as number;
      if (threshold < acc) return i;
    }
    return weights.length - 1;
  }

  /**
   * Standard normal via Box–Muller. The second variate is computed and
   * **discarded**, never cached: caching it would make results depend on how
   * many gaussians were previously drawn (§6.4).
   */
  gaussian(): number {
    let u1 = this.float();
    const u2 = this.float();
    // log(0) is -Infinity; clamp to the smallest representable float() output
    // so the draw stays finite without changing the stream position.
    if (u1 <= 0) u1 = TWO_POW_NEG53;
    return mathSqrt(-2 * mathLog(u1)) * mathCos(6.283185307179586 * u2);
  }

  /** Fisher–Yates descending, using `int(0, i)`. Returns a new array. */
  shuffle<T>(array: readonly T[]): T[] {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /** Uniform double in `[lo, hi)`. */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.float();
  }
}

/**
 * Derive a 32-bit integer key from a 256-bit seed, for the noise lattice's
 * cheap per-cell mixing. BLAKE3 per lattice cell would be correct but ~100×
 * slower; the lattice mix below is seeded *from* BLAKE3 and is itself a fixed,
 * pinned integer function, so determinism is preserved (§6.5 rule 6's "pinned
 * noise primitive" allowance).
 */
export function seed32(seed: Seed256): number {
  return (
    ((seed[0] as number) |
      ((seed[1] as number) << 8) |
      ((seed[2] as number) << 16) |
      ((seed[3] as number) << 24)) >>>
    0
  );
}
