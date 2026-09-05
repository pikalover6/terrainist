import { blake3 } from "@noble/hashes/blake3.js";
import { describe, expect, it } from "vitest";

import {
  Rng,
  columnFloat,
  le32,
  le64,
  nodeSeed,
  positionDigest,
  positionFloat,
  positionInt,
  positionWeighted,
  resolveWorldSeed,
  seed32,
  streamSeed,
  truncate64,
} from "../src/determinism/index.js";

const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const utf8 = new TextEncoder();

function cat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe("§6.1 world seed resolution", () => {
  it("parses hex strings", () => {
    expect(resolveWorldSeed("0xdeadbeef")).toBe(3735928559n);
    expect(resolveWorldSeed("0X5f3a19c2")).toBe(1597643202n);
  });

  it("parses decimal strings and numbers, wrapping to u64", () => {
    expect(resolveWorldSeed(813205)).toBe(813205n);
    expect(resolveWorldSeed("813205")).toBe(813205n);
    expect(resolveWorldSeed(-1)).toBe(18446744073709551615n);
    expect(resolveWorldSeed("18446744073709551615")).toBe(18446744073709551615n);
  });

  it("hashes arbitrary strings to a 64-bit seed", () => {
    expect(resolveWorldSeed("misty fjords")).toBe(10552861534622507875n);
    // truncate64 reads the first 8 digest bytes little-endian
    expect(resolveWorldSeed("misty fjords")).toBe(truncate64(blake3(utf8.encode("misty fjords"))));
  });

  it("rejects unsafe integer numbers per LOAM-E190", () => {
    expect(() => resolveWorldSeed(2 ** 60)).toThrow(/2\^53/);
    expect(() => resolveWorldSeed(1.5)).toThrow(/integer/);
  });
});

describe("§6.2 node seeds", () => {
  it("matches the spec'd encoding byte for byte", () => {
    const expected = blake3(
      cat(
        le64(813205n),
        Uint8Array.of(0x00),
        utf8.encode("world.terrain"),
        Uint8Array.of(0x00),
        utf8.encode(""),
      ),
      { dkLen: 32 },
    );
    expect(hex(nodeSeed(813205n, "world.terrain"))).toBe(hex(expected));
  });

  it("pins known vectors (changing these rerolls every world ever made)", () => {
    expect(hex(nodeSeed(813205n, "world.terrain"))).toBe(
      "05802331bb02ee1797c6572aee9bf70b7a32014458393c9aaf60ae58ee724c60",
    );
    expect(hex(nodeSeed(813205n, "world.terrain", "a"))).toBe(
      "47ed2fa2c4d283525e4aeb17b1d103fdb87641b2cae8fdd3a9c9b4ff5fa373b7",
    );
  });

  it("is sensitive to worldSeed, nodePath, and seedSalt independently", () => {
    const base = hex(nodeSeed(813205n, "world.terrain"));
    expect(hex(nodeSeed(813206n, "world.terrain"))).not.toBe(base);
    expect(hex(nodeSeed(813205n, "world.terrain2"))).not.toBe(base);
    expect(hex(nodeSeed(813205n, "world.terrain", "a"))).not.toBe(base);
    // no delimiter collisions: "a.b" + salt "" must differ from "a" + salt "b"
    expect(hex(nodeSeed(1n, "a.b", ""))).not.toBe(hex(nodeSeed(1n, "a", "b")));
  });

  it("does not depend on siblings or compile order (§6.7)", () => {
    const a = hex(nodeSeed(7n, "world.town.cathedral"));
    const b = hex(nodeSeed(7n, "world.town.cathedral"));
    expect(a).toBe(b);
  });
});

describe("§6.3 named streams and position-keyed draws", () => {
  const node = nodeSeed(813205n, "world.terrain");

  it("matches the spec'd stream encoding", () => {
    const expected = blake3(cat(node, Uint8Array.of(0x01), utf8.encode("noise")), { dkLen: 32 });
    expect(hex(streamSeed(node, "noise"))).toBe(hex(expected));
    expect(hex(streamSeed(node, "noise"))).toBe(
      "e2863725890943202d490f8eda662be4d024c98aacf13ff2b817a19ac4867912",
    );
  });

  it("keeps subsystems independent", () => {
    expect(hex(streamSeed(node, "scatter"))).not.toBe(hex(streamSeed(node, "palette")));
  });

  it("matches the spec'd position encoding", () => {
    const stream = streamSeed(node, "palette");
    const expected = blake3(cat(stream, le32(1), le32(2), le32(3)), { dkLen: 32 });
    expect(hex(positionDigest(stream, 1, 2, 3))).toBe(hex(expected));
    expect(hex(positionDigest(stream, 1, 2, 3))).toBe(
      "5b825d9ee60090b3a4f823728004b5712d373db4b6fc3c87340a7cd11876bffc",
    );
  });

  it("handles negative coordinates via two's complement LE32", () => {
    expect(Array.from(le32(-1))).toEqual([255, 255, 255, 255]);
    const stream = streamSeed(node, "palette");
    expect(positionFloat(stream, -1, 0, -1)).not.toBe(positionFloat(stream, 1, 0, 1));
  });

  it("produces order-independent uniform floats", () => {
    const stream = streamSeed(node, "palette");
    expect(positionFloat(stream, 1, 2, 3)).toBeCloseTo(0.7014160693200804, 15);
    let sum = 0;
    const n = 4096;
    for (let i = 0; i < n; i++) {
      const v = positionFloat(stream, i, 0, i * 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeGreaterThan(0.47);
    expect(sum / n).toBeLessThan(0.53);
  });

  it("produces in-range position ints and weighted picks", () => {
    const stream = streamSeed(node, "palette");
    for (let i = 0; i < 500; i++) {
      const v = positionInt(stream, i, 0, 0, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
    const counts = [0, 0, 0];
    for (let i = 0; i < 3000; i++) counts[positionWeighted(stream, i, 0, 0, [3, 2, 1])]!++;
    expect(counts[0]!).toBeGreaterThan(counts[1]!);
    expect(counts[1]!).toBeGreaterThan(counts[2]!);
  });

  it("exposes a column-keyed convenience that agrees with positionFloat", () => {
    const stream = streamSeed(node, "palette");
    expect(columnFloat(stream, 5, 6)).toBe(positionFloat(stream, 5, 0, 6));
    expect(columnFloat(stream, 5, 6, 1)).toBe(positionFloat(stream, 5, 1, 6));
  });

  it("derives stable 32-bit lattice keys", () => {
    expect(seed32(streamSeed(node, "noise"))).toBe(seed32(streamSeed(node, "noise")));
    expect(seed32(streamSeed(node, "noise"))).not.toBe(seed32(streamSeed(node, "noise.warp.x")));
  });
});

describe("§6.4 xoshiro256**", () => {
  const node = nodeSeed(813205n, "world.terrain");

  it("pins its first draws", () => {
    const r = new Rng(node);
    expect(r.nextU64()).toBe(4842617238952625797n);
    expect(r.float()).toBeCloseTo(0.3069027000626874, 15);
    expect(r.int(0, 99)).toBe(8);
  });

  it("reproduces exactly from the same stream seed", () => {
    const a = Rng.forStream(node, "jitter");
    const b = Rng.forStream(node, "jitter");
    for (let i = 0; i < 50; i++) expect(a.nextU64()).toBe(b.nextU64());
  });

  it("keeps float() in [0, 1) and int() inclusive on both ends", () => {
    const r = Rng.forStream(node, "scatter");
    for (let i = 0; i < 20000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    const seen = new Set<number>();
    const r2 = Rng.forStream(node, "decor");
    for (let i = 0; i < 2000; i++) seen.add(r2.int(-2, 2));
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2]);
    expect(r2.int(5, 5)).toBe(5);
  });

  it("draws weighted entries in declaration order", () => {
    const r = Rng.forStream(node, "palette");
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[r.weighted([3, 2, 1])]!++;
    expect(counts[0]!).toBeGreaterThan(counts[1]!);
    expect(counts[1]!).toBeGreaterThan(counts[2]!);
  });

  it("never caches the second Box–Muller variate", () => {
    // Drawing one gaussian must consume exactly two float() draws, so a
    // gaussian followed by a float matches float-float-float on a fresh stream.
    const a = Rng.forStream(node, "grammar");
    a.gaussian();
    const afterGaussian = a.float();
    const b = Rng.forStream(node, "grammar");
    b.float();
    b.float();
    expect(b.float()).toBe(afterGaussian);
  });

  it("produces a plausible standard normal", () => {
    const r = Rng.forStream(node, "grammar");
    let sum = 0;
    let sumSq = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const g = r.gaussian();
      expect(Number.isFinite(g)).toBe(true);
      sum += g;
      sumSq += g * g;
    }
    expect(Math.abs(sum / n)).toBeLessThan(0.05);
    expect(Math.abs(sumSq / n - 1)).toBeLessThan(0.06);
  });

  it("shuffles as a permutation, deterministically", () => {
    const input = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const a = Rng.forStream(node, "layout").shuffle(input);
    const b = Rng.forStream(node, "layout").shuffle(input);
    expect(a).toEqual(b);
    expect(a).not.toEqual(input);
    expect(a.slice().sort((x, y) => x - y)).toEqual(input);
  });

  it("repairs an all-zero state", () => {
    const r = new Rng(new Uint8Array(32));
    expect(r.nextU64()).not.toBe(0n);
  });
});
