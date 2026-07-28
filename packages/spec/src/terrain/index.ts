/**
 * The Loam **terrain profile** — types, diagnostics and validator.
 *
 * See `docs/LOAM-TERRAIN-PROFILE-v0.md`. A terrain-profile document is a
 * strict subset of Loam v0.1 plus `terrain.edit@0` and params-based coarse
 * placement, and it is what G2b's compiler consumes.
 */

export * from "./diagnostics.js";
export * from "./types.js";
export * from "./validate.js";
