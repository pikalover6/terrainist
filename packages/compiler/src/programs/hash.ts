/**
 * Hashing for authored programs: the source hash the compile refuses to run
 * without (`E333`), and the output hash it re-derives and compares (`E334`).
 *
 * The honest guarantee for a program written by a model and run on our machine
 * is not "the language is deterministic" but "the artifact is checked". Both
 * halves of that check are here.
 */

import { blake3 } from "@noble/hashes/blake3.js";

import { normalizeProgramSource, programSourceHash, type ProgramResult } from "@terrainist/spec";

const utf8 = new TextEncoder();

/** `b3:<hex>` of some bytes. */
export function digest(bytes: Uint8Array): string {
  const out = blake3(bytes, { dkLen: 32 });
  let hex = "";
  for (const b of out) hex += b.toString(16).padStart(2, "0");
  return `b3:${hex}`;
}

/**
 * Normalize source before hashing — the spec package owns the rule; this is a
 * re-export so the compile-time check and the authoring freeze cannot drift.
 */
export function normalizeSource(source: string): string {
  return normalizeProgramSource(source);
}

/**
 * `b3:` digest of the normalized source — always over the exact text stored in
 * the document, on every path (see `@terrainist/spec`'s `programs/hash.ts`).
 */
export function sourceHashOf(source: string): string {
  return programSourceHash(source);
}

/** One recorded write, node-local, in call order. */
export interface ProgramOp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly block: string;
}

/**
 * The canonical op stream: every write in **call order**, one per line, then
 * the returned result.
 *
 * Call order rather than sorted order on purpose — two programs that write the
 * same voxels in different orders are different programs, and the whole point
 * of the double run is to catch the one whose order is not stable.
 */
export function canonicalOpStream(
  ops: readonly ProgramOp[],
  result: ProgramResult | undefined,
): string {
  const lines: string[] = [];
  for (const op of ops) lines.push(`s ${op.x} ${op.y} ${op.z} ${op.block}`);
  if (result !== undefined) {
    lines.push(`r ${JSON.stringify(result.name)} ${result.seatY}`);
    for (const key of Object.keys(result.anchors ?? {}).sort()) {
      const p = (result.anchors as Record<string, readonly number[]>)[key] as readonly number[];
      lines.push(`a ${key} ${p[0]} ${p[1]} ${p[2]}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** `b3:` digest of a canonical op stream. */
export function opStreamHash(stream: string): string {
  return digest(utf8.encode(stream));
}
