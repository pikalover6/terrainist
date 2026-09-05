/**
 * The semantic intent layer (Phase 0 contract 1, Phase 2).
 *
 * `resolve.ts` inherits intent down the node path; `fanout.ts` is the registry
 * where a dial becomes a knob; `seam.ts` is the single file allowed to import a
 * subsystem, so the rows can live beside the code they drive.
 *
 * Phase 3 wave 1 adds `compiler-resolved.ts`: the compiler-owned grounded view
 * that wraps the merge and caches the typed values climate/flora/land-use/
 * palette/form consumers would otherwise each re-derive.
 */

export * from "./fanout.js";
export * from "./resolve.js";
export * from "./seam.js";
export * from "./compiler-resolved.js";
