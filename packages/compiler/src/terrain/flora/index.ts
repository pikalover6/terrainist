/**
 * The flora grammar (FLORA-GRAMMAR-v0 §3): shape programs, the parts model and
 * the parts → blockstate mapping.
 *
 * `vegetation.ts` keeps scatter, eligibility and `claimTrunk`, and re-exports
 * what moved, so no existing importer changes.
 */

export * from "./types.js";
export * from "./programs.js";
export * from "./parts.js";
