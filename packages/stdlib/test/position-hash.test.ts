import { blake3 } from "@noble/hashes/blake3.js";
import { describe, expect, it } from "vitest";

import { le32, positionDigest } from "../src/determinism/index.js";

/**
 * `positionDigest` no longer calls the generic BLAKE3 — it runs the
 * single-block specialisation in `determinism/position-hash.ts`. The generic
 * implementation stays here forever as the oracle: if the two ever disagree,
 * every world we have ever shipped stops reproducing.
 */
function genericPositionDigest(stream: Uint8Array, x: number, y: number, z: number): Uint8Array {
  const input = new Uint8Array(44);
  input.set(stream, 0);
  input.set(le32(x), 32);
  input.set(le32(y), 36);
  input.set(le32(z), 40);
  return blake3(input, { dkLen: 32 });
}

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");

describe("the specialised single-block position hash", () => {
  it("agrees with generic BLAKE3 across streams, coordinates and sign extremes", () => {
    const streams: Uint8Array[] = [];
    for (let k = 0; k < 4; k++) {
      const s = new Uint8Array(32);
      for (let i = 0; i < 32; i++) s[i] = (i * 37 + k * 101) & 0xff;
      streams.push(s);
    }
    // A seed carved out of a larger buffer: a Seed256 carries no alignment
    // guarantee, and the specialisation reads it byte-wise for that reason.
    const backing = new Uint8Array(35);
    for (let i = 0; i < 35; i++) backing[i] = (i * 13 + 5) & 0xff;
    streams.push(backing.subarray(3, 35));

    const coords: Array<[number, number, number]> = [
      [0, 0, 0],
      [-1, -1, -1],
      [2147483647, -2147483648, 0],
      [-2147483648, 2147483647, -1],
    ];
    for (let i = 0; i < 500; i++) coords.push([i * 7 - 1500, (i % 384) - 64, -i * 13 + 4444]);

    for (const stream of streams) {
      for (const [x, y, z] of coords) {
        expect(hex(positionDigest(stream, x, y, z))).toBe(hex(genericPositionDigest(stream, x, y, z)));
      }
    }
  });
});
