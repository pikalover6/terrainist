/**
 * Loam compiler.
 *
 * Placeholder scaffold: the real pipeline (parse/validate, style inheritance,
 * layout solve, generator expansion, CSG merge, connective pass, decoration,
 * lighting, Anvil emit) lands from G1's spike onward.
 */

import type { LoamDocument } from "@terrainist/spec";

export * from "./emit/index.js";
export * from "./layout/index.js";
export * from "./terrain/index.js";
export * from "./devworld.js";

/** Result of compiling a Loam document. Placeholder shape. */
export interface CompileResult {
  version: string;
}

/** Not implemented yet — the G1 spike replaces this with a real pipeline. */
export function compile(_document: LoamDocument): CompileResult {
  throw new Error("@terrainist/compiler: compile() is not implemented yet");
}
