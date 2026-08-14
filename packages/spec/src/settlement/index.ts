/**
 * The Loam **settlement profile**: the terrain profile plus structures.
 *
 * Everything a terrain document may say, a settlement document may say, with
 * the same restrictions. On top of that the root carries `building.grammar@0`
 * and `road.network@0` generator nodes and at most one `plaza` primitive, each
 * of which may declare an envelope, constraints (§4) and ports (§5) — the
 * inputs to the layout solver.
 */

export * from "./archetypes.js";
export * from "./constraints.js";
export * from "./infra-entries.js";
export * from "./types.js";
export * from "./validate.js";
