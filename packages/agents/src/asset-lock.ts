/**
 * The asset lockfile — LOAM-SPEC-v0.2 §9.8.
 *
 * External mesh generation is not deterministic; this file is where that
 * nondeterminism is confined. The honest statement of the guarantee, verbatim
 * from the spec: **given the asset lockfile, the whole compile is
 * byte-identical; without it, everything except asset voxels is.**
 *
 * Everything here is pure except the two filesystem functions, and nothing here
 * reads the clock: a lockfile entry's timestamp is *injected* by the caller, so
 * a test can pin it and a compile can choose to omit it entirely. Regenerating
 * an artifact is never automatic — {@link resolveAsset} reports
 * `LOAM-E311 ASSET_ARTIFACT_MISSING` rather than quietly calling the provider,
 * because a silent regeneration would change a world that was supposed to be
 * frozen.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { blake3 } from "@noble/hashes/blake3.js";

import { VOXELIZER_VERSION } from "./tripo-config.js";

/** The lockfile's `loam` version tag. */
export const ASSET_LOCK_LOAM_VERSION = "0.2";

/** The lockfile's `kind` discriminator. */
export const ASSET_LOCK_KIND = "asset-lock";

/** Conventional lockfile name, next to the document that produced it. */
export const ASSET_LOCK_FILENAME = "assets.lock.json";

/** Prefix on every cache key, so a key is self-describing in a diff. */
export const ASSET_KEY_PREFIX = "b3:";

/** A `b3:`-prefixed BLAKE3 cache key. */
export type AssetCacheKey = string;

/** JSON that canonicalizes — no `undefined`, no cycles, no class instances. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [k: string]: JsonValue };

/**
 * Every field that participates in the asset cache key (§9.8).
 *
 * Deliberately explicit rather than "whatever the node had": adding a field to
 * this interface changes every key, which is a decision, not an accident.
 */
export interface AssetCacheKeyInputs {
  /** The fully augmented prompt (§9.3) — not `params.prompt`. */
  readonly promptAugmented: string;
  readonly negativePrompt: string;
  /** Provider identity including the pinned model, e.g. `tripo/v3.0-…`. */
  readonly provider: string;
  readonly detail: number;
  readonly symmetry: string;
  readonly variants: number;
  readonly role: string;
  readonly sizeMode: string;
  readonly size: readonly [number, number, number];
  readonly front: string;
  readonly shell: JsonValue;
  readonly paletteHints: JsonValue;
  readonly voxelizerVersion: string;
  /** Minecraft block-data version the color table came from. */
  readonly blockDataVersion: string | number;
  /** The node's derived seed. Accepts bigint; serialized as a decimal string. */
  readonly nodeSeed: string | number | bigint;
}

/** One content-addressed artifact record. */
export interface AssetLockEntry {
  /** `"<provider>/<model>"`, e.g. `"tripo/v3.0-20250812"`. */
  readonly provider: string;
  /** SHA-256 (lowercase hex) of the downloaded mesh bytes. */
  readonly meshSha256: string;
  /** SHA-256 (lowercase hex) of the emitted Sponge `.schem`. */
  readonly schemSha256: string;
  /** Artifact path, repo-relative and POSIX-separated. */
  readonly path: string;
  /** Voxel bounding box of the emitted schematic. */
  readonly size: readonly [number, number, number];
  /**
   * When the entry was minted, as an ISO-8601 string.
   *
   * Provenance only — never an input to any hash, and injected by the caller
   * so nothing in this package reads the clock. Omit it for the tightest
   * possible byte-for-byte reproducibility of the lockfile itself.
   */
  readonly createdAt?: string;
}

/** The `assets.lock.json` document. */
export interface AssetLock {
  readonly loam: string;
  readonly kind: typeof ASSET_LOCK_KIND;
  readonly entries: Readonly<Record<AssetCacheKey, AssetLockEntry>>;
}

/** An empty, valid lockfile. */
export function emptyAssetLock(): AssetLock {
  return { loam: ASSET_LOCK_LOAM_VERSION, kind: ASSET_LOCK_KIND, entries: {} };
}

/* -------------------------------------------------------------------------- */
/* Canonicalization & hashing                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Canonical JSON: object keys sorted by code unit, no insignificant whitespace.
 *
 * The cache key is a hash of this string, so its stability *is* the cache's
 * stability. `undefined` members are dropped; non-finite numbers throw rather
 * than silently becoming `null` and colliding with a real `null`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`canonicalJson: non-finite number ${String(value)}`);
    }
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v === undefined ? null : v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`);
}

/** Lowercase hex of a byte array. */
export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** SHA-256 of raw bytes, lowercase hex — the artifact content addresses. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Derive the asset cache key (§9.8).
 *
 * `BLAKE3(canonical({...}))`, rendered as `b3:<64 hex chars>`. The field set is
 * fixed by {@link AssetCacheKeyInputs} and written out explicitly here so that
 * key derivation does not depend on the caller's object key order.
 */
export function assetCacheKey(inputs: AssetCacheKeyInputs): AssetCacheKey {
  const canonical = canonicalJson({
    promptAugmented: inputs.promptAugmented,
    negativePrompt: inputs.negativePrompt,
    provider: inputs.provider,
    detail: inputs.detail,
    symmetry: inputs.symmetry,
    variants: inputs.variants,
    role: inputs.role,
    sizeMode: inputs.sizeMode,
    size: inputs.size,
    front: inputs.front,
    shell: inputs.shell,
    paletteHints: inputs.paletteHints,
    voxelizerVersion: inputs.voxelizerVersion,
    blockDataVersion: inputs.blockDataVersion,
    nodeSeed:
      typeof inputs.nodeSeed === "bigint" ? inputs.nodeSeed.toString() : inputs.nodeSeed,
  });
  return ASSET_KEY_PREFIX + toHex(blake3(new TextEncoder().encode(canonical), { dkLen: 32 }));
}

/** The current voxelizer version, re-exported so callers need one import. */
export { VOXELIZER_VERSION };

/**
 * The conventional artifact path for a key: `assets/b3-<hex>.schem`.
 *
 * `:` is not portable in filenames, so the prefix separator becomes `-`.
 */
export function artifactPathFor(key: AssetCacheKey, dir = "assets"): string {
  return `${dir}/${key.replace(":", "-")}.schem`;
}

/* -------------------------------------------------------------------------- */
/* Load / save                                                                 */
/* -------------------------------------------------------------------------- */

/** Thrown when a lockfile exists but is not a well-formed asset lock. */
export class AssetLockFormatError extends Error {
  constructor(file: string, detail: string) {
    super(`${file}: not a valid ${ASSET_LOCK_KIND} document — ${detail}`);
    this.name = "AssetLockFormatError";
  }
}

/**
 * Read a lockfile. A missing file yields an empty lock (compiling without one
 * is legal per rule 3); a malformed file throws, because guessing what a
 * corrupted lock meant would be exactly the silent regeneration §9.8 forbids.
 */
export function loadAssetLock(file: string): AssetLock {
  if (!existsSync(file)) return emptyAssetLock();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
  } catch (error) {
    throw new AssetLockFormatError(file, `unparseable JSON (${(error as Error).message})`);
  }
  return narrowAssetLock(parsed, file);
}

/** Validate an arbitrary parsed value as an {@link AssetLock}. */
export function narrowAssetLock(parsed: unknown, file = "<memory>"): AssetLock {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AssetLockFormatError(file, "top level is not an object");
  }
  const p = parsed as { loam?: unknown; kind?: unknown; entries?: unknown };
  if (p.kind !== ASSET_LOCK_KIND) {
    throw new AssetLockFormatError(file, `kind is ${JSON.stringify(p.kind)}`);
  }
  if (typeof p.loam !== "string") {
    throw new AssetLockFormatError(file, "loam version is missing");
  }
  if (typeof p.entries !== "object" || p.entries === null || Array.isArray(p.entries)) {
    throw new AssetLockFormatError(file, "entries is not an object");
  }

  const entries: Record<string, AssetLockEntry> = {};
  for (const [key, raw] of Object.entries(p.entries as Record<string, unknown>)) {
    entries[key] = narrowEntry(raw, key, file);
  }
  return { loam: p.loam, kind: ASSET_LOCK_KIND, entries };
}

function narrowEntry(raw: unknown, key: string, file: string): AssetLockEntry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AssetLockFormatError(file, `entry ${key} is not an object`);
  }
  const e = raw as Record<string, unknown>;
  const str = (field: string): string => {
    const v = e[field];
    if (typeof v !== "string" || v === "") {
      throw new AssetLockFormatError(file, `entry ${key} has no ${field}`);
    }
    return v;
  };
  const size = e["size"];
  if (
    !Array.isArray(size) ||
    size.length !== 3 ||
    !size.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    throw new AssetLockFormatError(file, `entry ${key} has a malformed size`);
  }
  const createdAt = e["createdAt"];
  return {
    provider: str("provider"),
    meshSha256: str("meshSha256"),
    schemSha256: str("schemSha256"),
    path: str("path"),
    size: [size[0] as number, size[1] as number, size[2] as number],
    ...(typeof createdAt === "string" ? { createdAt } : {}),
  };
}

/**
 * Serialize a lockfile deterministically — sorted keys, two-space indent,
 * trailing newline. Two compiles that add the same entries produce the same
 * bytes, so the file diffs cleanly in review.
 */
export function serializeAssetLock(lock: AssetLock): string {
  const keys = Object.keys(lock.entries).sort();
  const entries: Record<string, unknown> = {};
  for (const k of keys) {
    const e = lock.entries[k] as AssetLockEntry;
    entries[k] = {
      provider: e.provider,
      meshSha256: e.meshSha256,
      schemSha256: e.schemSha256,
      path: e.path,
      size: [e.size[0], e.size[1], e.size[2]],
      ...(e.createdAt !== undefined ? { createdAt: e.createdAt } : {}),
    };
  }
  return `${JSON.stringify({ loam: lock.loam, kind: lock.kind, entries }, null, 2)}\n`;
}

/** Write a lockfile, creating its directory if needed. */
export function saveAssetLock(file: string, lock: AssetLock): void {
  mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  writeFileSync(file, serializeAssetLock(lock), "utf8");
}

/**
 * Return a new lock with one entry added or replaced.
 *
 * Pure: the input lock is never mutated, so a caller can stage entries and
 * decide later whether the compile earned the right to write them.
 */
export function withAssetEntry(
  lock: AssetLock,
  key: AssetCacheKey,
  entry: AssetLockEntry,
): AssetLock {
  return { ...lock, entries: { ...lock.entries, [key]: entry } };
}

/* -------------------------------------------------------------------------- */
/* Resolution — §9.8 rules 1–4                                                 */
/* -------------------------------------------------------------------------- */

/** LOAM-E311. Raised when a locked artifact is not on disk. */
export const ASSET_ARTIFACT_MISSING = "LOAM-E311" as const;

/**
 * The §9.8 rule-2 condition, as a typed error.
 *
 * Not wired into the compiler's diagnostics yet — the code and message are
 * carried here so that wiring is a rename-free mechanical step later.
 */
export class AssetArtifactMissingError extends Error {
  readonly code = ASSET_ARTIFACT_MISSING;
  readonly key: AssetCacheKey;
  readonly artifactPath: string;
  constructor(key: AssetCacheKey, artifactPath: string) {
    super(
      `${ASSET_ARTIFACT_MISSING} ASSET_ARTIFACT_MISSING: the asset lock pins ${key} to ` +
        `${artifactPath}, but that file is missing. Restore the artifact or remove the ` +
        `lock entry deliberately — regenerating it would change the world.`,
    );
    this.name = "AssetArtifactMissingError";
    this.key = key;
    this.artifactPath = artifactPath;
  }
}

/** Outcome of looking an asset up in the lock. */
export type AssetResolution =
  | {
      /** Rule 1 (or rule 4 via `pin`): artifact present, no provider call. */
      readonly outcome: "hit";
      readonly key: AssetCacheKey;
      readonly entry: AssetLockEntry;
      /** Absolute path to the artifact. */
      readonly artifactPath: string;
      /** True when the entry was reached through `params.pin`. */
      readonly pinned: boolean;
    }
  | {
      /** Rule 3: no entry at all. Caller may generate; `assetsResolved: false`. */
      readonly outcome: "miss";
      readonly key: AssetCacheKey;
    };

/** Inputs to {@link resolveAsset}. */
export interface ResolveAssetOptions {
  readonly lock: AssetLock;
  readonly key: AssetCacheKey;
  /** `params.pin` — forces a specific artifact regardless of the key (rule 4). */
  readonly pin?: string | null;
  /** Directory the entry `path`s are relative to (normally the repo root). */
  readonly baseDir: string;
  /** Existence probe. Injected so tests need no filesystem. */
  readonly exists?: (absolutePath: string) => boolean;
}

/**
 * Apply §9.8 rules 1–4.
 *
 * Never regenerates: a lock entry whose artifact is gone throws
 * {@link AssetArtifactMissingError} rather than falling through to `miss`, so
 * "silently regenerate" is not reachable from this API by accident.
 */
export function resolveAsset(options: ResolveAssetOptions): AssetResolution {
  const exists = options.exists ?? ((p: string) => existsSync(p));
  const pinned = options.pin !== undefined && options.pin !== null && options.pin !== "";
  const lookupKey = pinned ? (options.pin as string) : options.key;

  const entry = options.lock.entries[lookupKey];
  if (entry === undefined) {
    if (pinned) {
      // A pin that names nothing is a typo in the document, not a cache miss:
      // silently generating a fresh mesh would defeat the point of pinning.
      throw new AssetArtifactMissingError(lookupKey, "<no lock entry>");
    }
    return { outcome: "miss", key: options.key };
  }

  const artifactPath = path.resolve(options.baseDir, entry.path);
  if (!exists(artifactPath)) throw new AssetArtifactMissingError(lookupKey, artifactPath);

  return { outcome: "hit", key: lookupKey, entry, artifactPath, pinned };
}
