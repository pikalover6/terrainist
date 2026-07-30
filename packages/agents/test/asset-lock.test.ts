/**
 * Asset lockfile tests — LOAM-SPEC-v0.2 §9.8.
 *
 * Offline and clock-free: the only filesystem use is a temp directory for the
 * round-trip test, and every timestamp is injected.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  ASSET_ARTIFACT_MISSING,
  AssetArtifactMissingError,
  AssetLockFormatError,
  artifactPathFor,
  assetCacheKey,
  canonicalJson,
  emptyAssetLock,
  loadAssetLock,
  resolveAsset,
  saveAssetLock,
  serializeAssetLock,
  sha256Hex,
  withAssetEntry,
} from "../src/asset-lock.js";
import type { AssetCacheKeyInputs, AssetLockEntry } from "../src/asset-lock.js";
import { VOXELIZER_VERSION } from "../src/tripo-config.js";

const tmp = mkdtempSync(path.join(tmpdir(), "terrainist-asset-lock-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function inputs(overrides: Partial<AssetCacheKeyInputs> = {}): AssetCacheKeyInputs {
  return {
    promptAugmented: "a colossal seated cat carved as a gothic cathedral\nStyle: gothic.",
    negativePrompt: "modern, cartoon, text",
    provider: "tripo/v3.0-20250812",
    detail: 0.7,
    symmetry: "bilateral_x",
    variants: 1,
    role: "shell",
    sizeMode: "fit",
    size: [80, 60, 80],
    front: "south",
    shell: { thickness: 3, floorLevels: [0, 18, 36] },
    paletteHints: { strategy: "style_first", restrictTo: ["@wall", "@glass"] },
    voxelizerVersion: VOXELIZER_VERSION,
    blockDataVersion: 4671,
    nodeSeed: "12345678901234567890",
    ...overrides,
  };
}

const ENTRY: AssetLockEntry = {
  provider: "tripo/v3.0-20250812",
  meshSha256: "a".repeat(64),
  schemSha256: "b".repeat(64),
  path: "assets/b3-7f21.schem",
  size: [78, 60, 74],
};

describe("canonicalJson", () => {
  it("sorts object keys so caller key order cannot move the hash", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ a: 2, b: 1 })).toBe(canonicalJson({ b: 1, a: 2 }));
  });

  it("sorts nested keys and preserves array order", () => {
    expect(canonicalJson({ z: [{ y: 1, x: 2 }] })).toBe('{"z":[{"x":2,"y":1}]}');
  });

  it("drops undefined members and normalizes -0", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalJson(-0)).toBe("0");
  });

  it("serializes bigint as a decimal string", () => {
    expect(canonicalJson(12345678901234567890n)).toBe('"12345678901234567890"');
  });

  it("throws on a non-finite number rather than emitting null", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(/non-finite/);
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });
});

describe("assetCacheKey", () => {
  it("is stable across runs and prefixed with b3:", () => {
    const key = assetCacheKey(inputs());
    expect(key).toMatch(/^b3:[0-9a-f]{64}$/);
    expect(assetCacheKey(inputs())).toBe(key);
  });

  it("does not depend on the caller's property insertion order", () => {
    const a = inputs();
    const reordered = Object.fromEntries(
      Object.entries(a).reverse(),
    ) as unknown as AssetCacheKeyInputs;
    expect(assetCacheKey(reordered)).toBe(assetCacheKey(a));
  });

  it("changes when any keyed field changes", () => {
    const base = assetCacheKey(inputs());
    const mutations: Partial<AssetCacheKeyInputs>[] = [
      { promptAugmented: "something else" },
      { negativePrompt: "" },
      { provider: "tripo/v2.5-20250123" },
      { detail: 0.6 },
      { symmetry: "none" },
      { variants: 2 },
      { role: "solid" },
      { sizeMode: "exact" },
      { size: [80, 60, 81] },
      { front: "north" },
      { shell: { thickness: 2 } },
      { paletteHints: { strategy: "color_first" } },
      { voxelizerVersion: "1" },
      { blockDataVersion: 4670 },
      { nodeSeed: "1" },
    ];
    for (const m of mutations) {
      expect(assetCacheKey(inputs(m)), JSON.stringify(m)).not.toBe(base);
    }
  });

  it("treats a bigint nodeSeed as its decimal string", () => {
    expect(assetCacheKey(inputs({ nodeSeed: 42n }))).toBe(assetCacheKey(inputs({ nodeSeed: "42" })));
  });
});

describe("sha256Hex / artifactPathFor", () => {
  it("hashes the empty input to the known SHA-256 constant", () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("maps a key to a filename-safe artifact path", () => {
    expect(artifactPathFor("b3:7f21")).toBe("assets/b3-7f21.schem");
    expect(artifactPathFor("b3:7f21", "out/assets")).toBe("out/assets/b3-7f21.schem");
  });
});

describe("lockfile round-trip", () => {
  it("writes and reads back an identical document", () => {
    const file = path.join(tmp, "assets.lock.json");
    const lock = withAssetEntry(emptyAssetLock(), "b3:7f21", {
      ...ENTRY,
      createdAt: "2026-07-30T00:00:00.000Z",
    });
    saveAssetLock(file, lock);
    expect(loadAssetLock(file)).toEqual(lock);
  });

  it("serializes entries in sorted key order, deterministically", () => {
    const a = withAssetEntry(withAssetEntry(emptyAssetLock(), "b3:zz", ENTRY), "b3:aa", ENTRY);
    const b = withAssetEntry(withAssetEntry(emptyAssetLock(), "b3:aa", ENTRY), "b3:zz", ENTRY);
    expect(serializeAssetLock(a)).toBe(serializeAssetLock(b));
    expect(serializeAssetLock(a).indexOf("b3:aa")).toBeLessThan(
      serializeAssetLock(a).indexOf("b3:zz"),
    );
    expect(serializeAssetLock(a).endsWith("\n")).toBe(true);
  });

  it("omits createdAt entirely when it is not injected — no clock reads", () => {
    const text = serializeAssetLock(withAssetEntry(emptyAssetLock(), "b3:7f21", ENTRY));
    expect(text).not.toContain("createdAt");
  });

  it("does not mutate the input lock", () => {
    const base = emptyAssetLock();
    withAssetEntry(base, "b3:7f21", ENTRY);
    expect(Object.keys(base.entries)).toHaveLength(0);
  });

  it("treats a missing file as an empty lock (compiling without one is legal)", () => {
    expect(loadAssetLock(path.join(tmp, "absent.json"))).toEqual(emptyAssetLock());
  });

  it("throws rather than guessing on a malformed lock", () => {
    const cases: string[] = [
      "{",
      "[]",
      '{"loam":"0.2","kind":"nope","entries":{}}',
      '{"kind":"asset-lock","entries":{}}',
      '{"loam":"0.2","kind":"asset-lock","entries":[]}',
      '{"loam":"0.2","kind":"asset-lock","entries":{"b3:1":{"provider":"tripo"}}}',
      '{"loam":"0.2","kind":"asset-lock","entries":{"b3:1":{"provider":"t","meshSha256":"m","schemSha256":"s","path":"p","size":[1,2]}}}',
    ];
    cases.forEach((body, i) => {
      const file = path.join(tmp, `bad-${i}.json`);
      writeFileSync(file, body, "utf8");
      expect(() => loadAssetLock(file), body).toThrow(AssetLockFormatError);
    });
  });
});

describe("resolveAsset", () => {
  const lock = withAssetEntry(emptyAssetLock(), "b3:7f21", ENTRY);
  const present = (): boolean => true;
  const absent = (): boolean => false;

  it("rule 1 — a hit when the entry and artifact both exist", () => {
    const result = resolveAsset({ lock, key: "b3:7f21", baseDir: "/repo", exists: present });
    expect(result.outcome).toBe("hit");
    if (result.outcome !== "hit") throw new Error("unreachable");
    expect(result.entry).toEqual(ENTRY);
    expect(result.pinned).toBe(false);
    expect(result.artifactPath).toBe(path.resolve("/repo", ENTRY.path));
  });

  it("rule 2 — LOAM-E311 when the artifact is gone, never a silent regenerate", () => {
    const error = (() => {
      try {
        resolveAsset({ lock, key: "b3:7f21", baseDir: "/repo", exists: absent });
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(AssetArtifactMissingError);
    const e = error as AssetArtifactMissingError;
    expect(e.code).toBe(ASSET_ARTIFACT_MISSING);
    expect(e.message).toContain("ASSET_ARTIFACT_MISSING");
    expect(e.key).toBe("b3:7f21");
  });

  it("rule 3 — a miss when there is no entry at all", () => {
    const result = resolveAsset({ lock, key: "b3:other", baseDir: "/repo", exists: present });
    expect(result).toEqual({ outcome: "miss", key: "b3:other" });
  });

  it("rule 4 — a pin overrides the computed key", () => {
    const result = resolveAsset({
      lock,
      key: "b3:computed-and-unknown",
      pin: "b3:7f21",
      baseDir: "/repo",
      exists: present,
    });
    expect(result.outcome).toBe("hit");
    if (result.outcome !== "hit") throw new Error("unreachable");
    expect(result.pinned).toBe(true);
    expect(result.key).toBe("b3:7f21");
  });

  it("a pin that names nothing is an error, not a cache miss", () => {
    expect(() =>
      resolveAsset({ lock, key: "b3:7f21", pin: "b3:typo", baseDir: "/repo", exists: present }),
    ).toThrow(AssetArtifactMissingError);
  });

  it("treats null and empty-string pins as absent", () => {
    for (const pin of [null, "", undefined]) {
      const result = resolveAsset({ lock, key: "b3:7f21", pin, baseDir: "/repo", exists: present });
      expect(result.outcome).toBe("hit");
      if (result.outcome !== "hit") throw new Error("unreachable");
      expect(result.pinned).toBe(false);
    }
  });
});
