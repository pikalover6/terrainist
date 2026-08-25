/**
 * A specialised BLAKE3 for the one input shape the compiler hashes tens of
 * millions of times: `streamSeed(32) ‖ LE32(x) ‖ LE32(y) ‖ LE32(z)` — exactly
 * 44 bytes, unkeyed, 32 bytes of output.
 *
 * 44 bytes is a single chunk *and* a single block, so the whole hash is one
 * compression with `CHUNK_START | CHUNK_END | ROOT`: no chunk stack, no
 * hasher object, no buffering, no output XOF machinery. That is the entire
 * optimisation — the maths below is BLAKE3 unchanged, and the generic
 * `blake3()` from `@noble/hashes` remains the implementation for every other
 * length (`nodeSeed`, `streamSeed`, `resolveWorldSeed`).
 *
 * Byte-identity with the generic path is not a hope: it is asserted against
 * `blake3()` as a live oracle for every input length 0..64 in
 * `test/position-hash.test.ts`, and the compiler's three baseline worlds
 * shasum identical across the change.
 *
 * Nothing here allocates. The `m`/`v` scratch is module-level and consumed
 * entirely within one synchronous call — these are leaf functions with no
 * callbacks, so there is no re-entrancy to worry about. They are also
 * per-realm, so a worker thread gets its own copy for free.
 */

// The BLAKE3 IV — the SHA-256 initialisation vector.
const IV0 = 0x6a09e667 | 0;
const IV1 = 0xbb67ae85 | 0;
const IV2 = 0x3c6ef372 | 0;
const IV3 = 0xa54ff53a | 0;
const IV4 = 0x510e527f | 0;
const IV5 = 0x9b05688c | 0;
const IV6 = 0x1f83d9ab | 0;
const IV7 = 0x5be0cd19 | 0;

/** `CHUNK_START | CHUNK_END | ROOT` — the flags for a hash that is one block. */
const SINGLE_BLOCK_FLAGS = 0b1011;

/** Seven rounds of message schedule, the identity row repeatedly permuted. */
const SIGMA = /* @__PURE__ */ (() => {
  const permutation = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];
  const out = new Uint8Array(7 * 16);
  let row = Array.from({ length: 16 }, (_, i) => i);
  for (let r = 0; r < 7; r++) {
    out.set(row, r * 16);
    row = permutation.map((i) => row[i] as number);
  }
  return out;
})();

/** The 16 message words of the block being compressed. */
const m = new Int32Array(16);
/** The 16 working words of the compression. */
const v = new Int32Array(16);

function g(a: number, b: number, c: number, d: number, mx: number, my: number): void {
  let va = v[a] as number;
  let vb = v[b] as number;
  let vc = v[c] as number;
  let vd = v[d] as number;
  va = (va + vb + mx) | 0;
  vd = vd ^ va;
  vd = (vd >>> 16) | (vd << 16);
  vc = (vc + vd) | 0;
  vb = vb ^ vc;
  vb = (vb >>> 12) | (vb << 20);
  va = (va + vb + my) | 0;
  vd = vd ^ va;
  vd = (vd >>> 8) | (vd << 24);
  vc = (vc + vd) | 0;
  vb = vb ^ vc;
  vb = (vb >>> 7) | (vb << 25);
  v[a] = va;
  v[b] = vb;
  v[c] = vc;
  v[d] = vd;
}

/** Compress the loaded message block `m` into `v`. Counter is 0: one chunk. */
function compress(blockLen: number): void {
  v[0] = IV0;
  v[1] = IV1;
  v[2] = IV2;
  v[3] = IV3;
  v[4] = IV4;
  v[5] = IV5;
  v[6] = IV6;
  v[7] = IV7;
  v[8] = IV0;
  v[9] = IV1;
  v[10] = IV2;
  v[11] = IV3;
  v[12] = 0;
  v[13] = 0;
  v[14] = blockLen;
  v[15] = SINGLE_BLOCK_FLAGS;
  for (let r = 0; r < 7; r++) {
    const o = r * 16;
    g(0, 4, 8, 12, m[SIGMA[o] as number] as number, m[SIGMA[o + 1] as number] as number);
    g(1, 5, 9, 13, m[SIGMA[o + 2] as number] as number, m[SIGMA[o + 3] as number] as number);
    g(2, 6, 10, 14, m[SIGMA[o + 4] as number] as number, m[SIGMA[o + 5] as number] as number);
    g(3, 7, 11, 15, m[SIGMA[o + 6] as number] as number, m[SIGMA[o + 7] as number] as number);
    g(0, 5, 10, 15, m[SIGMA[o + 8] as number] as number, m[SIGMA[o + 9] as number] as number);
    g(1, 6, 11, 12, m[SIGMA[o + 10] as number] as number, m[SIGMA[o + 11] as number] as number);
    g(2, 7, 8, 13, m[SIGMA[o + 12] as number] as number, m[SIGMA[o + 13] as number] as number);
    g(3, 4, 9, 14, m[SIGMA[o + 14] as number] as number, m[SIGMA[o + 15] as number] as number);
  }
}

/**
 * Load `stream ‖ LE32(x) ‖ LE32(y) ‖ LE32(z)` into the message block.
 *
 * The stream seed is read byte-wise rather than through a `Uint32Array` view
 * because a `Seed256` is a plain `Uint8Array` with no alignment guarantee
 * (`subarray` into a larger buffer is common) — and 32 byte loads cost about
 * what the defensive copy would have cost anyway.
 */
function loadPositionBlock(stream: Uint8Array, x: number, y: number, z: number): void {
  for (let i = 0, b = 0; i < 8; i++, b += 4) {
    m[i] =
      ((stream[b] as number) |
        ((stream[b + 1] as number) << 8) |
        ((stream[b + 2] as number) << 16) |
        ((stream[b + 3] as number) << 24)) |
      0;
  }
  m[8] = x | 0;
  m[9] = y | 0;
  m[10] = z | 0;
  m[11] = 0;
  m[12] = 0;
  m[13] = 0;
  m[14] = 0;
  m[15] = 0;
}

/**
 * `BLAKE3_256(stream ‖ LE32(x) ‖ LE32(y) ‖ LE32(z))`, written into `out` as
 * 32 little-endian bytes. `out` must have at least 32 elements.
 */
export function positionDigestInto(
  stream: Uint8Array,
  x: number,
  y: number,
  z: number,
  out: Uint8Array,
): void {
  loadPositionBlock(stream, x, y, z);
  compress(44);
  for (let i = 0, b = 0; i < 8; i++, b += 4) {
    const w = (v[i] as number) ^ (v[i + 8] as number);
    out[b] = w & 0xff;
    out[b + 1] = (w >>> 8) & 0xff;
    out[b + 2] = (w >>> 16) & 0xff;
    out[b + 3] = (w >>> 24) & 0xff;
  }
}

/**
 * The first 8 digest bytes as a little-endian u64, split into two unsigned
 * 32-bit halves — `truncate64` without ever forming a BigInt. This is the
 * only part of the digest that `positionFloat` and `positionInt` read, so the
 * remaining 24 bytes are never even written out.
 *
 * Returns the low half; the high half is left in {@link positionHigh}, which
 * must be read before the next call.
 */
export function positionLow32(stream: Uint8Array, x: number, y: number, z: number): number {
  loadPositionBlock(stream, x, y, z);
  compress(44);
  positionHigh = ((v[1] as number) ^ (v[9] as number)) >>> 0;
  return ((v[0] as number) ^ (v[8] as number)) >>> 0;
}

/** The high half of the u64 last produced by {@link positionLow32}. */
export let positionHigh = 0;
