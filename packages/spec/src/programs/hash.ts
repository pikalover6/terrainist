/**
 * The one source-hash rule for authored programs.
 *
 * `sourceHash` is a promise about *the exact text stored in the document* —
 * the model's verbatim source — and it is checked on a different machine, in a
 * different package, than the one that made it. So the rule lives here, in the
 * package both sides already depend on, and nowhere else: the authoring freeze
 * (`@terrainist/agents`) and the compile-time check (`@terrainist/compiler`)
 * are both thin re-exports of these two functions.
 *
 * They used to be two implementations that agreed on every program anyone had
 * tried, and disagreed the first time a model left a trailing space on a line
 * (2026-08-15): the document recorded one digest, the compile computed another,
 * and the world died on `E333 PROGRAM_SOURCE_HASH_MISMATCH` for a difference
 * no program can observe. Never write a second one.
 */

import { blake3 } from "@noble/hashes/blake3.js";

const utf8 = new TextEncoder();

/**
 * Normalize source before hashing: CRLF (and lone CR) folded to LF, trailing
 * whitespace off each line, exactly one trailing newline.
 *
 * Whitespace at the end of a line is the one difference a model, an editor and
 * a JSON round-trip can introduce without changing a single thing the program
 * does, and it is not worth a hard compile error.
 *
 * This is a *hashing* normalization only. It never rewrites what is stored in
 * the document, and it is unrelated to the run-time normalizations the
 * compiler applies before execution (fuel instrumentation, brace-wrapping of
 * braceless bodies): those happen after hashing, on a copy, and the document
 * keeps the model's verbatim text.
 */
export function normalizeProgramSource(source: string): string {
  const lines = source.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

/** `b3:<hex>` BLAKE3-256 of the normalized source — the contract's `sourceHash`. */
export function programSourceHash(source: string): string {
  const out = blake3(utf8.encode(normalizeProgramSource(source)), { dkLen: 32 });
  let hex = "";
  for (const b of out) hex += b.toString(16).padStart(2, "0");
  return `b3:${hex}`;
}
