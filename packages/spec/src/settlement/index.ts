/**
 * The **settlement profile** — part of the compiler's internal representation
 * (`@terrainist/spec/ir`). A Loam 1 document is lowered onto it by
 * `lowerLoam`; nothing authors it directly.
 *
 * The terrain profile plus structures: the root carries `building.grammar@0`
 * and `road.network@0` generator nodes and at most one `plaza` primitive, each
 * of which may declare an envelope and constraints — the inputs to the layout
 * solver.
 */

export * from "./archetypes.js";
export * from "./constraints.js";
export * from "./infra-entries.js";
export * from "./types.js";
export * from "./validate.js";
