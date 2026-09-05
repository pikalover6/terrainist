/**
 * **Loam 1** — the authoring language: its vocabulary, validator and lowering,
 * plus the diagnostic type every stage of the pipeline speaks.
 *
 * The profile a Loam 1 document lowers onto is the compiler's internal
 * representation and lives behind `@terrainist/spec/ir`.
 */

export * from "./terrain/diagnostics.js";
export * from "./loam/index.js";

/** The one language version. */
export const LOAM_VERSION = "1";
