/**
 * Loam spec language — types and schema.
 *
 * Placeholder scaffold: the real four-layer document model (L3 styles,
 * L2 scene graph, L1 generators, L0 voxel IR) lands in G2.
 */

export * from "./terrain/index.js";
export * from "./settlement/index.js";
export * from "./intent/index.js";
export * from "./programs/index.js";

/** Draft version of the Loam document format. */
export const LOAM_VERSION = "0.1.0-draft";

/** Root of a Loam document. Placeholder shape. */
export interface LoamDocument {
  version: string;
}
