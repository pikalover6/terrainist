/**
 * The semantic intent layer (Phase 0 contract 1, Phase 2).
 *
 * `resolve.ts` inherits intent down the node path; `fanout.ts` is the registry
 * where a dial becomes a knob; `seam.ts` is the single file allowed to import a
 * subsystem, so the rows can live beside the code they drive.
 */

export * from "./fanout.js";
export * from "./resolve.js";
export * from "./seam.js";
